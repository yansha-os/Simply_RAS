'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';

type MfaSecurityPanelProps = {
  createClient: () => SupabaseClient;
};

type TotpFactor = {
  id: string;
  friendly_name?: string;
  status: 'verified' | 'unverified';
  created_at: string;
};

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

export function MfaSecurityPanel({ createClient }: MfaSecurityPanelProps) {
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const verifiedFactors = factors.filter((factor) => factor.status === 'verified');

  const loadFactors = useCallback(async () => {
    const { data, error: listError } = await createClient().auth.mfa.listFactors();
    if (listError) {
      setError('Unable to load authenticator factors.');
      return;
    }
    setFactors(data.totp as TotpFactor[]);
  }, [createClient]);

  useEffect(() => {
    void loadFactors();
  }, [loadFactors]);

  async function beginEnrollment() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const { data, error: enrollError } = await createClient().auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Rise & Shine authenticator ${factors.length + 1}`,
    });
    if (enrollError) {
      setError('Unable to start authenticator enrollment.');
    } else {
      setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    }
    setBusy(false);
  }

  async function verifyEnrollment() {
    if (!enrollment || !/^\d{6}$/.test(code)) {
      setError('Enter the six-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: verifyError } = await createClient().auth.mfa.challengeAndVerify({
      factorId: enrollment.factorId,
      code,
    });
    if (verifyError) {
      setError('That code could not be verified. Wait for a new code and try again.');
    } else {
      setEnrollment(null);
      setCode('');
      setMessage('Authenticator verified. Your current session now has AAL2 protection.');
      await loadFactors();
    }
    setBusy(false);
  }

  async function cancelEnrollment() {
    if (!enrollment) return;
    setBusy(true);
    await createClient().auth.mfa.unenroll({ factorId: enrollment.factorId });
    setEnrollment(null);
    setCode('');
    setBusy(false);
    await loadFactors();
  }

  async function removeFactor(factorId: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: removeError } = await createClient().auth.mfa.unenroll({ factorId });
    if (removeError) {
      setError('Verify this session with MFA before removing a verified authenticator.');
    } else {
      setMessage('Authenticator removed.');
      await loadFactors();
    }
    setBusy(false);
  }

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 p-6 shadow-2xl backdrop-blur-xl md:p-8">
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="relative space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-400">Account protection</p>
            <h1 className="font-heading text-2xl font-black text-white">Authenticator security</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">Use a time-based authenticator app. Add a second device before enforcement so a lost phone does not lock out your administrator account.</p>
          </div>
          <button type="button" disabled={busy || Boolean(enrollment)} onClick={beginEnrollment} className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 text-xs font-bold text-cyan-300 transition-all duration-300 hover:scale-[1.01] hover:border-cyan-400/60 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add authenticator
          </button>
        </div>

        {error && <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}
        {message && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" />{message}</div>}

        {enrollment && (
          <div className="grid gap-6 rounded-2xl border border-cyan-500/20 bg-black/30 p-5 md:grid-cols-[220px_1fr]">
            <div className="rounded-2xl bg-white p-3">
              {/* Supabase returns a local SVG data URL; it is never persisted by this app. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={enrollment.qrCode} alt="Authenticator enrollment QR code" className="aspect-square w-full" />
            </div>
            <div className="space-y-4">
              <div><h2 className="font-heading text-lg font-bold text-white">Scan and verify</h2><p className="mt-1 text-sm text-zinc-400">Scan the QR code, or enter the secret manually, then type the current six-digit code.</p></div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-3"><p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Manual secret</p><p className="mt-1 break-all font-mono text-sm text-zinc-200">{enrollment.secret}</p></div>
              <input aria-label="Six-digit authenticator code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-lg tracking-[0.35em] text-white outline-none transition focus:border-cyan-500/60" placeholder="000000" />
              <div className="flex gap-3"><button type="button" disabled={busy} onClick={verifyEnrollment} className="cursor-pointer rounded-xl bg-cyan-500 px-4 py-2.5 text-xs font-black text-zinc-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50">Verify authenticator</button><button type="button" disabled={busy} onClick={cancelEnrollment} className="cursor-pointer rounded-xl border border-white/10 px-4 py-2.5 text-xs font-bold text-zinc-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button></div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /><h2 className="text-sm font-bold text-white">Verified authenticators</h2></div>
          {verifiedFactors.length === 0 ? (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">No verified authenticator is enrolled. AAL2 must remain unenforced until at least two recovery-capable factors are verified.</div>
          ) : verifiedFactors.map((factor) => (
            <div key={factor.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all duration-300 hover:border-cyan-500/30">
              <div className="flex min-w-0 items-center gap-3"><div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2"><KeyRound className="h-4 w-4 text-emerald-400" /></div><div className="min-w-0"><p className="truncate text-sm font-bold text-white">{factor.friendly_name || 'Authenticator app'}</p><p className="font-mono text-[10px] uppercase text-emerald-400">Verified</p></div></div>
              <button type="button" disabled={busy || verifiedFactors.length < 2} onClick={() => removeFactor(factor.id)} aria-label={`Remove ${factor.friendly_name || 'authenticator'}`} title={verifiedFactors.length < 2 ? 'Add a recovery authenticator before removing this one.' : 'Remove authenticator'} className="cursor-pointer rounded-lg border border-rose-500/20 bg-rose-500/10 p-2 text-rose-400 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
