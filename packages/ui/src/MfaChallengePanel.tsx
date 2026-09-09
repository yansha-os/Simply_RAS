'use client';

import { useEffect, useState } from 'react';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';

type MfaChallengePanelProps = {
  createClient: () => SupabaseClient;
  nextPath: string;
};

type VerifiedFactor = {
  id: string;
  friendly_name?: string;
  status: 'verified';
};

export function MfaChallengePanel({ createClient, nextPath }: MfaChallengePanelProps) {
  const [factors, setFactors] = useState<VerifiedFactor[]>([]);
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let active = true;
    void createClient().auth.mfa.listFactors().then(({ data, error: listError }) => {
      if (!active) return;
      if (listError) {
        setError('Unable to load your authenticators. Please reload and try again.');
      } else {
        const verified = data.totp.filter(
          (factor): factor is typeof factor & { status: 'verified' } => factor.status === 'verified'
        );
        setFactors(verified);
        setFactorId(verified[0]?.id || '');
        if (verified.length === 0) setError('No verified authenticator is available for this account. Contact an administrator.');
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [createClient]);

  async function verify() {
    if (!factorId || !/^\d{6}$/.test(code)) {
      setError('Enter the six-digit code from your authenticator app.');
      return;
    }
    setVerifying(true);
    setError(null);
    const { error: verifyError } = await createClient().auth.mfa.challengeAndVerify({ factorId, code });
    if (verifyError) {
      setError('That code could not be verified. Wait for a new code and try again.');
      setVerifying(false);
      return;
    }
    window.location.replace(nextPath);
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-4 py-10 text-white">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
      <section className="relative w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950/85 p-7 shadow-2xl backdrop-blur-xl">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-500/30 bg-cyan-500/10 shadow-lg shadow-cyan-500/10">
          <ShieldCheck className="h-7 w-7 text-cyan-300" />
        </div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-400">Second factor required</p>
        <h1 className="mt-2 font-heading text-2xl font-black">Verify your identity</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">Enter the current code from your authenticator app to continue into protected Rise &amp; Shine systems.</p>

        <div className="mt-6 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" />Loading authenticators…</div>
          ) : factors.length > 1 ? (
            <label className="block text-xs font-bold text-zinc-300">Authenticator
              <select value={factorId} onChange={(event) => setFactorId(event.target.value)} className="mt-2 w-full cursor-pointer rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500/60">
                {factors.map((factor) => <option key={factor.id} value={factor.id}>{factor.friendly_name || 'Authenticator app'}</option>)}
              </select>
            </label>
          ) : factors.length === 1 ? (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4"><KeyRound className="h-4 w-4 text-emerald-400" /><span className="text-sm font-bold text-emerald-200">{factors[0]?.friendly_name || 'Authenticator app'}</span></div>
          ) : null}

          <input aria-label="Six-digit authenticator code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} disabled={loading || factors.length === 0 || verifying} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={(event) => { if (event.key === 'Enter') void verify(); }} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-center font-mono text-xl tracking-[0.4em] text-white outline-none transition focus:border-cyan-500/60 disabled:cursor-not-allowed disabled:opacity-50" placeholder="000000" />
          {error && <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}
          <button type="button" disabled={loading || factors.length === 0 || verifying} onClick={verify} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-zinc-950 transition-all hover:scale-[1.01] hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">
            {verifying && <Loader2 className="h-4 w-4 animate-spin" />}{verifying ? 'Verifying…' : 'Verify and continue'}
          </button>
        </div>
      </section>
    </main>
  );
}
