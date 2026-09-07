'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { AlertTriangle, FileSpreadsheet, Loader2 } from 'lucide-react';
import { getClientAuthLedgers } from '@/app/actions/authCptLedgerActions';
import ReAuthCompilerModal from '@/components/portal-clinical/ReAuthCompilerModal';

type ReAuthT45BannerProps = {
  clientId: string;
  clientName: string;
};

export default function ReAuthT45Banner({ clientId, clientName }: ReAuthT45BannerProps) {
  const [t45Due, setT45Due] = useState(false);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [authLabel, setAuthLabel] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const load = () => {
    startTransition(async () => {
      const res = await getClientAuthLedgers(clientId);
      if (res.success && res.ledgers?.length) {
        const urgent = res.ledgers
          .filter((l) => l.daysRemaining != null && l.daysRemaining <= 45)
          .sort((a, b) => (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999))[0];
        if (urgent) {
          setT45Due(true);
          setDaysRemaining(urgent.daysRemaining);
          setAuthLabel(urgent.authNumber ? `Auth #${urgent.authNumber}` : urgent.authType);
        } else {
          setT45Due(false);
          setDaysRemaining(null);
          setAuthLabel(null);
        }
      } else {
        setT45Due(false);
      }
      setLoaded(true);
    });
  };

  useEffect(() => {
    if (clientId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  if (!loaded && isPending) {
    return null;
  }

  if (!t45Due) {
    return null;
  }

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-zinc-950/90 to-zinc-950/80 p-5 shadow-xl backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-amber-500/15 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10">
              <AlertTriangle className="h-5 w-5 text-amber-300" />
            </span>
            <div>
              <h4 className="font-heading text-sm font-bold text-white">T-45 re-authorization window</h4>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                {authLabel ? `${authLabel} · ` : ''}
                {daysRemaining != null
                  ? daysRemaining <= 0
                    ? 'Authorization expired or ends today — submit re-auth immediately.'
                    : `${daysRemaining} day(s) until authorization end.`
                  : 'Authorization entering renewal window.'}{' '}
                Compile the BCBA re-auth packet from live trial progress before Plutus submission.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-2.5 text-xs font-bold text-amber-200 transition-all duration-300 hover:border-amber-500/60 hover:bg-amber-500/25 hover:scale-[1.02]"
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-3.5 w-3.5" />
            )}
            Open Re-Auth Compiler
          </button>
        </div>
      </div>

      <ReAuthCompilerModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        clientId={clientId}
        clientName={clientName}
      />
    </>
  );
}
