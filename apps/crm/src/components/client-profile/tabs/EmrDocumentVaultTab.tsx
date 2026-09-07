'use client';

import React, { useCallback, useEffect, useState, useTransition } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  FolderOpen,
  RefreshCw,
} from 'lucide-react';
import {
  getClientEmrDocumentVault,
  verifyVaultDocument,
} from '@/app/actions/emrDocumentVaultActions';
import type { DocumentCategory, EmrVaultAuditSummary, VaultDocumentItem } from '@/lib/emrDocumentVault';

interface EmrDocumentVaultTabProps {
  clientId: string;
  clientName?: string;
}

const CATEGORY_TITLES: Record<DocumentCategory, { title: string; desc: string }> = {
  DIAGNOSTIC_AND_MEDICAL: {
    title: 'Diagnostic & Medical Evaluations',
    desc: 'F84.0 Autism evaluations, psychological assessments & physician ABA prescriptions.',
  },
  INSURANCE_AND_AUTH: {
    title: 'Insurance Cards & Prior Authorizations',
    desc: 'Primary/Medicaid cards, payer approval letters & prior treatment plans.',
  },
  LEGAL_AND_CONSENTS: {
    title: 'Consents, Custody & Safety',
    desc: 'Signed treatment agreements, telehealth consents & legal guardianship papers.',
  },
  EDUCATIONAL_AND_IEP: {
    title: 'Educational Records & IEPs',
    desc: 'School Individualized Education Programs, 504 plans & CSE accommodations.',
  },
  ARCHIVES_AND_OTHER: {
    title: 'Historical EMR archive',
    desc: 'Legacy chart exports, historical session PDFs, and miscellaneous archived uploads.',
  },
};

export default function EmrDocumentVaultTab({
  clientId,
  clientName = 'Client',
}: EmrDocumentVaultTabProps) {
  const [vault, setVault] = useState<EmrVaultAuditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = useCallback(() => {
    startTransition(async () => {
      setLoading(true);
      setError(null);
      const res = await getClientEmrDocumentVault(clientId);
      if (res.success && res.vaultSummary) {
        setVault(res.vaultSummary);
      } else {
        setError(res.error || 'Failed to load EMR document vault.');
      }
      setLoading(false);
    });
  }, [clientId]);

  useEffect(() => {
    if (clientId) {
      loadData();
    }
  }, [clientId, loadData]);

  const handleVerify = async (docId: string) => {
    const res = await verifyVaultDocument(docId);
    if (res.success) {
      loadData();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-orange-500/20 bg-brand-orange-500/10 text-brand-orange-400">
            <FolderOpen className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-base font-bold text-white">
                Clinical EMR Document Vault & Archive
              </h3>
              {vault && (
                <span
                  className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                    vault.auditReadinessPct === 100
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                      : vault.auditReadinessPct >= 70
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}
                >
                  {vault.auditReadinessPct}% Audit Ready
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400">
              Categorized clinical chart documents, IEP/Rx expiration tracking & legacy EMR archive for {clientName}.
            </p>
          </div>
        </div>

        <button
          onClick={loadData}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-white/20 hover:text-white transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
          Refresh Vault
        </button>
      </div>

      {/* Content */}
      {loading && !vault ? (
        <div className="flex items-center justify-center py-16 text-zinc-400">
          <RefreshCw className="h-6 w-6 animate-spin text-brand-orange-500 mr-2" />
          <span className="font-mono text-xs">Auditing client document repository...</span>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-400">
          {error}
        </div>
      ) : vault ? (
        <div className="space-y-6">
          {/* Expiration Alerts */}
          {vault.expiredAlerts.length > 0 && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300 space-y-1">
              <div className="font-semibold flex items-center gap-1.5 text-red-400">
                <AlertTriangle className="h-4 w-4" />
                Expired Documents Require Immediate Renewal
              </div>
              {vault.expiredAlerts.map((doc) => (
                <div key={doc.id} className="pl-5 font-mono text-[11px]">
                  • {doc.displayName} expired on {doc.expirationDate}
                </div>
              ))}
            </div>
          )}

          {/* Categorized Document Folders */}
          {(Object.entries(vault.categories) as [DocumentCategory, VaultDocumentItem[]][]).map(
            ([categoryKey, docs]) => {
              const catInfo = CATEGORY_TITLES[categoryKey];

              return (
                <div
                  key={categoryKey}
                  className="rounded-2xl border border-white/10 bg-zinc-950/80 p-5 shadow-xl backdrop-blur-xl"
                >
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div>
                      <h4 className="font-heading text-sm font-bold text-white">
                        {catInfo.title}
                      </h4>
                      <p className="text-[11px] text-zinc-400">{catInfo.desc}</p>
                    </div>
                    <span className="font-mono text-xs text-zinc-500">
                      {docs.length} document(s)
                    </span>
                  </div>

                  {docs.length === 0 ? (
                    <div className="py-6 text-center text-xs font-mono text-zinc-600">
                      No documents uploaded in this category.
                    </div>
                  ) : (
                    <div className="mt-3 divide-y divide-white/5 font-mono text-xs">
                      {docs.map((d) => (
                        <div key={d.id} className="flex items-center justify-between py-2.5">
                          <div className="flex items-center gap-3">
                            <FileText className="h-4 w-4 text-zinc-400" />
                            <div>
                              <div className="font-sans font-semibold text-white">
                                {d.displayName}
                              </div>
                              <div className="text-[10px] text-zinc-500">
                                Uploaded {d.createdAt.split('T')[0]}
                                {d.expirationDate && (
                                  <span
                                    className={`ml-2 ${
                                      d.isExpired
                                        ? 'text-red-400 font-bold'
                                        : d.daysUntilExpiration && d.daysUntilExpiration <= 30
                                        ? 'text-amber-400'
                                        : 'text-zinc-400'
                                    }`}
                                  >
                                    (Expires: {d.expirationDate})
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {d.isVerified ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-400 border border-green-500/20">
                                <CheckCircle2 className="h-3 w-3" />
                                Verified
                              </span>
                            ) : (
                              <button
                                onClick={() => handleVerify(d.id)}
                                className="rounded bg-white/10 px-2 py-1 text-[10px] font-bold text-zinc-200 hover:bg-white/20 transition-colors cursor-pointer"
                              >
                                Mark Verified
                              </button>
                            )}

                            {d.fileUrl && (
                              <a
                                href={d.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded p-1 text-zinc-400 hover:text-white transition-colors"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
          )}
        </div>
      ) : null}
    </div>
  );
}
